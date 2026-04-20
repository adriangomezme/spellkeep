import { useState } from 'react';
import {
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { BottomSheet } from '../BottomSheet';
import { moveToFolderLocal } from '../../lib/collections.local';
import type { CollectionType } from '../../lib/collections';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type FolderRow = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  visible: boolean;
  collectionId: string;
  collectionType: CollectionType;
  onClose: () => void;
  onMoved: () => void;
};

export function FolderPickerModal({ visible, collectionId, collectionType, onClose, onMoved }: Props) {
  const [isMoving, setIsMoving] = useState(false);

  // Local-first: folders come straight from SQLite so the picker works
  // offline and paints instantly.
  const folderRows = useQuery<FolderRow>(
    `SELECT id, name, color
       FROM collection_folders
      WHERE type = ?
      ORDER BY LOWER(name)`,
    [collectionType]
  );
  const folders = (folderRows.data ?? []) as FolderRow[];
  const isLoading = folderRows.isLoading;

  async function handleSelect(folderId: string) {
    setIsMoving(true);
    try {
      await moveToFolderLocal(collectionId, folderId);
      onMoved();
    } catch (err) {
      console.error('Move error:', err);
    } finally {
      setIsMoving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Move to Folder</Text>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : folders.length === 0 ? (
        <Text style={styles.emptyText}>
          No {collectionType} folders yet. Create one first.
        </Text>
      ) : (
        folders.map((folder) => (
          <TouchableOpacity
            key={folder.id}
            style={styles.folderRow}
            onPress={() => handleSelect(folder.id)}
            disabled={isMoving}
            activeOpacity={0.5}
          >
            <Ionicons name="folder" size={20} color={folder.color || '#A0A8B8'} />
            <Text style={styles.folderName}>{folder.name}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))
      )}
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
  loader: {
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  folderName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
});
