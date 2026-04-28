import { useState } from 'react';
import {
  View,
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

export function FolderPickerModal({
  visible,
  collectionId,
  collectionType,
  onClose,
  onMoved,
}: Props) {
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Move to folder</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : folders.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="folder-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No folders yet</Text>
          <Text style={styles.emptyText}>
            Create a {collectionType} folder first to move this {collectionType} into it.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {folders.map((folder, idx) => {
            const tint = folder.color || '#A0A8B8';
            const isLast = idx === folders.length - 1;
            return (
              <TouchableOpacity
                key={folder.id}
                style={[styles.row, !isLast && styles.rowDivider]}
                onPress={() => handleSelect(folder.id)}
                disabled={isMoving}
                activeOpacity={0.6}
              >
                <View style={[styles.thumb, { backgroundColor: tint + '22' }]}>
                  <Ionicons name="folder" size={16} color={tint} />
                </View>
                <Text style={styles.rowName} numberOfLines={1}>{folder.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
  loader: {
    paddingVertical: spacing.xl,
  },
  list: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 30,
    height: 30,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
});
