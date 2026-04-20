import { useMemo, useState, useCallback, useEffect } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchCollectionStats,
  duplicateCollection,
  emptyCollection,
  type CollectionSummary,
  type CollectionType,
} from '../../../src/lib/collections';
import {
  deleteCollectionLocal,
  deleteFolderWithContentsLocal,
  moveToFolderLocal,
} from '../../../src/lib/collections.local';
import { useCollectionsHub } from '../../../src/lib/hooks/useCollectionsHub';
import { useImportJob } from '../../../src/components/collection/ImportJobProvider';
import { MergeModal } from '../../../src/components/collection/MergeModal';
import { ExportModal } from '../../../src/components/collection/ExportModal';
import { ImportModal } from '../../../src/components/collection/ImportModal';
import { CollectionListItem } from '../../../src/components/collection/CollectionListItem';
import { CollectionActionSheet } from '../../../src/components/collection/CollectionActionSheet';
import { EditCollectionInfoModal } from '../../../src/components/collection/EditCollectionInfoModal';
import { CreateCollectionModal } from '../../../src/components/collection/CreateCollectionModal';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../../src/constants';

export default function FolderDetailScreen() {
  const { id, name: folderName, color: folderColor, folderType } =
    useLocalSearchParams<{ id: string; name: string; color?: string; folderType?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { binders, lists, revalidate } = useCollectionsHub();
  const items = useMemo<CollectionSummary[]>(
    () => [...binders, ...lists].filter((c) => c.folder_id === id),
    [binders, lists, id]
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CollectionSummary | null>(null);
  const [showItemActions, setShowItemActions] = useState(false);
  const [showItemEdit, setShowItemEdit] = useState(false);
  const [showItemMerge, setShowItemMerge] = useState(false);
  const [showItemExport, setShowItemExport] = useState(false);
  const [showItemImport, setShowItemImport] = useState(false);

  const refresh = useCallback(async () => {
    revalidate();
    setIsRefreshing(false);
  }, [revalidate]);

  useFocusEffect(useCallback(() => { revalidate(); }, [revalidate]));

  const { job } = useImportJob();
  useEffect(() => {
    if (job?.status !== 'completed') return;
    fetchCollectionStats(job.collectionId).catch(() => {});
    revalidate();
  }, [job?.status, job?.id, job?.collectionId, revalidate]);

  function handleItemPress(item: CollectionSummary) {
    router.push({
      pathname: '/collection/[id]',
      params: { id: item.id, name: item.name, type: item.type },
    });
  }

  function handleAddInFolder() {
    setShowCreate(true);
  }

  function confirmDeleteItem(item: CollectionSummary) {
    Alert.alert(`Delete ${item.name}?`, 'This will delete all cards inside.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        deleteCollectionLocal(item.id).catch(() => {});
      }},
    ]);
  }

  function handleItemAction(key: string) {
    if (!selectedItem) return;
    if (key === 'edit') {
      setShowItemActions(false);
      setShowItemEdit(true);
    } else if (key === 'merge') {
      setShowItemActions(false);
      setShowItemMerge(true);
    } else if (key === 'import') {
      setShowItemActions(false);
      setShowItemImport(true);
    } else if (key === 'export') {
      setShowItemActions(false);
      setShowItemExport(true);
    } else if (key === 'duplicate') {
      setShowItemActions(false);
      setSelectedItem(null);
      duplicateCollection(selectedItem.id)
        .then(() => revalidate())
        .catch((err) => Alert.alert('Duplicate failed', err?.message ?? 'Unknown error'));
    } else if (key === 'remove-from-folder') {
      setShowItemActions(false);
      setSelectedItem(null);
      moveToFolderLocal(selectedItem.id, null).catch(() => {});
    } else if (key === 'empty') {
      const item = selectedItem;
      setShowItemActions(false);
      setSelectedItem(null);
      const label = item.type === 'list' ? 'list' : 'binder';
      Alert.alert(
        `Empty this ${label}?`,
        `All cards will be removed. The ${label} itself stays with its name and settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Empty',
            style: 'destructive',
            onPress: () => {
              emptyCollection(item.id)
                .then(() => revalidate())
                .catch((err) => Alert.alert('Error', err?.message ?? 'Failed to empty'));
            },
          },
        ]
      );
    } else if (key === 'delete') {
      const item = selectedItem;
      setShowItemActions(false);
      setSelectedItem(null);
      Alert.alert('Delete?', 'This will delete all cards inside.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          deleteCollectionLocal(item.id).catch(() => {});
        }},
      ]);
    } else {
      setShowItemActions(false);
      setSelectedItem(null);
    }
  }

  function handleFolderAction(key: string) {
    setShowActions(false);
    if (key === 'edit') {
      setShowEdit(true);
    } else if (key === 'delete') {
      Alert.alert(
        `Delete ${folderName}?`,
        'This will delete the folder and all binders/lists inside it with their cards.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
            onPress: async () => {
              try {
                await deleteFolderWithContentsLocal(id!);
                router.back();
              } catch (err) {
                Alert.alert('Error', 'Failed to delete folder');
              }
            },
          },
        ]
      );
    }
  }

  const itemTypeLabel = (folderType as string) === 'list' ? 'List' : 'Binder';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Ionicons name="folder" size={22} color={folderColor || '#A0A8B8'} />
        <Text style={styles.title} numberOfLines={1}>{folderName ?? 'Folder'}</Text>
        <TouchableOpacity onPress={handleAddInFolder} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowActions(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setIsRefreshing(true); refresh(); }}
              tintColor={colors.primary}
            />
          }
        >
          {items.length === 0 ? (
            <View style={styles.centered}>
              <View style={styles.emptyIcon}>
                <Ionicons name="folder-open-outline" size={40} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>Empty folder</Text>
              <Text style={styles.emptySubtitle}>
                Tap + to add a {itemTypeLabel.toLowerCase()}
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <CollectionListItem
                key={item.id}
                name={item.name}
                type={item.type}
                color={item.color}
                subtitle={`${item.card_count} Cards · ${item.unique_cards} unique`}
                onPress={() => handleItemPress(item)}
                onLongPress={() => { setSelectedItem(item); setShowItemActions(true); }}
                onSwipeDelete={() => confirmDeleteItem(item)}
              />
            ))
          )}
        </ScrollView>

      <CollectionActionSheet
        visible={showActions && !showEdit}
        itemName={folderName ?? ''}
        itemType="folder"
        onAction={handleFolderAction}
        onClose={() => setShowActions(false)}
      />

      <CreateCollectionModal
        visible={showCreate}
        lockedType={(folderType as CollectionType) || 'binder'}
        lockedFolderId={id}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); revalidate(); }}
      />

      <EditCollectionInfoModal
        visible={showEdit}
        itemId={id!}
        itemName={folderName ?? ''}
        itemColor={folderColor ? folderColor : null}
        itemType="folder"
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); router.back(); }}
      />

      {/* Item-level modals */}
      <CollectionActionSheet
        visible={showItemActions}
        itemName={selectedItem?.name ?? ''}
        itemType={selectedItem?.type ?? 'binder'}
        inFolder
        onAction={handleItemAction}
        onClose={() => { setShowItemActions(false); setSelectedItem(null); }}
      />

      {selectedItem && (
        <EditCollectionInfoModal
          visible={showItemEdit}
          itemId={selectedItem.id}
          itemName={selectedItem.name}
          itemColor={selectedItem.color}
          itemType={selectedItem.type}
          onClose={() => { setShowItemEdit(false); setSelectedItem(null); }}
          onSaved={() => { setShowItemEdit(false); setSelectedItem(null); revalidate(); }}
        />
      )}

      {selectedItem && (
        <MergeModal
          visible={showItemMerge}
          sourceId={selectedItem.id}
          sourceName={selectedItem.name}
          sourceType={selectedItem.type}
          onClose={() => { setShowItemMerge(false); setSelectedItem(null); }}
          onMerged={() => { setShowItemMerge(false); setSelectedItem(null); revalidate(); }}
        />
      )}

      {selectedItem && (
        <ExportModal
          visible={showItemExport}
          collectionId={selectedItem.id}
          collectionName={selectedItem.name}
          onClose={() => { setShowItemExport(false); setSelectedItem(null); }}
        />
      )}

      {selectedItem && (
        <ImportModal
          visible={showItemImport}
          collectionId={selectedItem.id}
          collectionName={selectedItem.name}
          onClose={() => { setShowItemImport(false); setSelectedItem(null); }}
          onImported={() => { setShowItemImport(false); setSelectedItem(null); revalidate(); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginHorizontal: spacing.xl,
  },
});
