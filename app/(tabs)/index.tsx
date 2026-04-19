import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import {
  fetchCollectionSummaries,
  fetchOwnedCardStats,
  fetchFolders,
  duplicateCollection,
  deleteCollection,
  deleteFolderWithContents,
  emptyCollection,
  moveToFolder,
  type CollectionSummary,
  type CollectionType,
  type FolderSummary,
  type OwnedCardStats,
} from '../../src/lib/collections';
import { CatalogBadge } from '../../src/components/CatalogBadge';
import { CollectionListItem } from '../../src/components/collection/CollectionListItem';
import { FolderListItem } from '../../src/components/collection/FolderListItem';
import { CreateCollectionModal } from '../../src/components/collection/CreateCollectionModal';
import { MarketHeaderCompact } from '../../src/components/collection/MarketHeaderCompact';
import { InsightTabs } from '../../src/components/collection/InsightTabs';
import { useImportJob } from '../../src/components/collection/ImportJobProvider';
import { CollectionActionSheet } from '../../src/components/collection/CollectionActionSheet';
import { EditCollectionInfoModal } from '../../src/components/collection/EditCollectionInfoModal';
import { MergeModal } from '../../src/components/collection/MergeModal';
import { FolderPickerModal } from '../../src/components/collection/FolderPickerModal';
import { ExportModal } from '../../src/components/collection/ExportModal';
import { ImportModal } from '../../src/components/collection/ImportModal';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

type Tab = 'binder' | 'list';

type ActionTarget =
  | { kind: 'collection'; item: CollectionSummary }
  | { kind: 'folder'; item: FolderSummary };

export default function CollectionHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('binder');
  const [ownedStats, setOwnedStats] = useState<OwnedCardStats>({ total_cards: 0, unique_cards: 0, total_value: 0 });
  const [binders, setBinders] = useState<CollectionSummary[]>([]);
  const [lists, setLists] = useState<CollectionSummary[]>([]);
  const [binderFolders, setBinderFolders] = useState<FolderSummary[]>([]);
  const [listFolders, setListFolders] = useState<FolderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Action sheet / modals state
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [summaries, stats, bFolders, lFolders] = await Promise.all([
        fetchCollectionSummaries(user.id),
        fetchOwnedCardStats(user.id),
        fetchFolders(user.id, 'binder'),
        fetchFolders(user.id, 'list'),
      ]);

      setBinders(summaries.filter((c) => c.type === 'binder' && !c.folder_id));
      setLists(summaries.filter((c) => c.type === 'list' && !c.folder_id));
      setBinderFolders(bFolders);
      setListFolders(lFolders);
      setOwnedStats(stats);
    } catch (err) {
      console.error('Hub fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { fetchAll(); }, [fetchAll])
  );

  // Refresh the hub totals whenever a background import finishes, so the
  // destination binder's "X Cards · Y unique" reflects the new state
  // without needing a manual pull-to-refresh.
  const { job } = useImportJob();
  useEffect(() => {
    if (job?.status === 'completed') fetchAll();
  }, [job?.status, job?.id, fetchAll]);

  function handleItemPress(item: CollectionSummary) {
    router.push({
      pathname: '/collection/[id]',
      params: { id: item.id, name: item.name, type: item.type },
    });
  }

  function handleFolderPress(folder: FolderSummary) {
    router.push({
      pathname: '/collection/folder/[id]',
      params: { id: folder.id, name: folder.name, color: folder.color ?? '', folderType: folder.type },
    });
  }

  function handleAction(key: string) {
    if (!actionTarget) return;

    if (key === 'edit') {
      setShowEdit(true);
    } else if (key === 'duplicate' && actionTarget.kind === 'collection') {
      setActionTarget(null);
      handleDuplicate(actionTarget.item);
    } else if (key === 'merge' && actionTarget.kind === 'collection') {
      setShowMerge(true);
    } else if (key === 'import' && actionTarget.kind === 'collection') {
      setShowImport(true);
    } else if (key === 'export' && actionTarget.kind === 'collection') {
      setShowExport(true);
    } else if (key === 'move-to-folder' && actionTarget.kind === 'collection') {
      setShowFolderPicker(true);
    } else if (key === 'remove-from-folder' && actionTarget.kind === 'collection') {
      setActionTarget(null);
      moveToFolder(actionTarget.item.id, null).then(() => fetchAll()).catch(() => {});
    } else if (key === 'empty' && actionTarget.kind === 'collection') {
      const target = actionTarget.item as CollectionSummary;
      setActionTarget(null);
      const label = target.type === 'list' ? 'list' : 'binder';
      Alert.alert(
        `Empty this ${label}?`,
        `All cards will be removed. The ${label} itself stays with its name and settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Empty',
            style: 'destructive',
            onPress: () => {
              emptyCollection(target.id)
                .then(() => fetchAll())
                .catch((err) => Alert.alert('Error', err?.message ?? 'Failed to empty'));
            },
          },
        ]
      );
    } else if (key === 'delete') {
      const target = actionTarget;
      setActionTarget(null);
      confirmDelete(target);
    } else {
      setActionTarget(null);
    }
  }

  async function handleDuplicate(item: CollectionSummary) {
    try {
      await duplicateCollection(item.id);
      fetchAll();
    } catch (err) {
      Alert.alert('Error', 'Failed to duplicate');
    }
  }

  function confirmDelete(target: ActionTarget | null) {
    if (!target) return;
    const name = target.item.name;
    const isFolder = target.kind === 'folder';

    Alert.alert(
      `Delete ${name}?`,
      isFolder
        ? 'This will delete the folder and all binders/lists inside it with their cards.'
        : 'This will delete all cards inside.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isFolder) {
                await deleteFolderWithContents(target.item.id);
              } else {
                await deleteCollection(target.item.id);
              }
              fetchAll();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  }

  // Derive edit/merge props from actionTarget
  const editProps = actionTarget ? {
    itemId: actionTarget.item.id,
    itemName: actionTarget.item.name,
    itemColor: actionTarget.item.color ?? null,
    itemType: (actionTarget.kind === 'folder' ? 'folder' : (actionTarget.item as CollectionSummary).type) as 'binder' | 'list' | 'folder',
  } : null;

  const mergeSource = actionTarget?.kind === 'collection' ? actionTarget.item as CollectionSummary : null;

  const query = search.toLowerCase().trim();
  const allItems = activeTab === 'binder' ? binders : lists;
  const allFolders = activeTab === 'binder' ? binderFolders : listFolders;
  const items = query ? allItems.filter((i) => i.name.toLowerCase().includes(query)) : allItems;
  const folders = query ? allFolders.filter((f) => f.name.toLowerCase().includes(query)) : allFolders;
  const emptyMessage = activeTab === 'binder'
    ? 'Create a binder to organize your cards'
    : 'Create a list for wishlists or trades';

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Collection</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {showSearch ? (
          <View style={styles.searchHeader}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search..."
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => { setSearch(''); setShowSearch(false); }}>
              <Text style={styles.searchCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>Collection</Text>
            <View style={styles.headerActions}>
              <CatalogBadge />
              <TouchableOpacity
                onPress={() => setShowSearch(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="search" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCreate(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add-circle" size={28} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={styles.padH}>
        <MarketHeaderCompact />
      </View>

      <View style={styles.padL}>
        <InsightTabs onTabPress={(key) => console.log('Insight:', key)} />
      </View>

      <View style={styles.segmentedWrapper}>
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'binder' && styles.segmentButtonActive]}
            onPress={() => setActiveTab('binder')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, activeTab === 'binder' && styles.segmentTextActive]}>
              Binders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'list' && styles.segmentButtonActive]}
            onPress={() => setActiveTab('list')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, activeTab === 'list' && styles.segmentTextActive]}>
              Lists
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { setIsRefreshing(true); fetchAll(); }}
            tintColor={colors.primary}
          />
        }
      >
        {activeTab === 'binder' && (
          <TouchableOpacity
            style={styles.ownedRow}
            onPress={() => router.push('/collection/owned')}
            activeOpacity={0.6}
          >
            <View style={styles.ownedIconCircle}>
              <Ionicons name="library" size={20} color="#6B8AFF" />
            </View>
            <View style={styles.ownedInfo}>
              <Text style={styles.ownedTitle}>Owned Cards</Text>
              <Text style={styles.ownedSubtitle}>
                {ownedStats.total_cards} Cards · {ownedStats.unique_cards} unique
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {folders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Folders</Text>
            {folders.map((folder) => (
              <FolderListItem
                key={folder.id}
                name={folder.name}
                itemCount={folder.item_count}
                color={folder.color}
                onPress={() => handleFolderPress(folder)}
                onLongPress={() => setActionTarget({ kind: 'folder', item: folder })}
                onSwipeDelete={() => confirmDelete({ kind: 'folder', item: folder })}
              />
            ))}
          </>
        )}

        {items.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              {activeTab === 'binder' ? 'Binders' : 'Lists'}
            </Text>
            {items.map((item) => (
              <CollectionListItem
                key={item.id}
                name={item.name}
                type={item.type}
                color={item.color}
                subtitle={`${item.card_count} Cards · ${item.unique_cards} unique`}
                onPress={() => handleItemPress(item)}
                onLongPress={() => setActionTarget({ kind: 'collection', item })}
                onSwipeDelete={() => confirmDelete({ kind: 'collection', item })}
              />
            ))}
          </>
        )}

        {items.length === 0 && folders.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={activeTab === 'binder' ? 'albums-outline' : 'list-outline'}
                size={40}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'binder' ? 'No binders yet' : 'No lists yet'}
            </Text>
            <Text style={styles.emptySubtitle}>{emptyMessage}</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowCreate(true)}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.emptyButtonText}>
                Create {activeTab === 'binder' ? 'Binder' : 'List'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <CreateCollectionModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); fetchAll(); }}
      />

      <CollectionActionSheet
        visible={actionTarget !== null && !showEdit && !showMerge && !showFolderPicker && !showExport && !showImport}
        itemName={actionTarget?.item.name ?? ''}
        itemType={
          actionTarget?.kind === 'folder'
            ? 'folder'
            : (actionTarget?.item as CollectionSummary)?.type ?? 'binder'
        }
        inFolder={actionTarget?.kind === 'collection' ? !!(actionTarget.item as CollectionSummary).folder_id : false}
        onAction={handleAction}
        onClose={() => setActionTarget(null)}
      />

      {editProps && (
        <EditCollectionInfoModal
          visible={showEdit}
          {...editProps}
          onClose={() => { setShowEdit(false); setActionTarget(null); }}
          onSaved={() => { setShowEdit(false); setActionTarget(null); fetchAll(); }}
        />
      )}

      {mergeSource && (
        <MergeModal
          visible={showMerge}
          sourceId={mergeSource.id}
          sourceName={mergeSource.name}
          sourceType={mergeSource.type}
          onClose={() => { setShowMerge(false); setActionTarget(null); }}
          onMerged={() => { setShowMerge(false); setActionTarget(null); fetchAll(); }}
        />
      )}

      {mergeSource && (
        <FolderPickerModal
          visible={showFolderPicker}
          collectionId={mergeSource.id}
          collectionType={mergeSource.type}
          onClose={() => { setShowFolderPicker(false); setActionTarget(null); }}
          onMoved={() => { setShowFolderPicker(false); setActionTarget(null); fetchAll(); }}
        />
      )}

      {mergeSource && (
        <ImportModal
          visible={showImport}
          collectionId={mergeSource.id}
          collectionName={mergeSource.name}
          onClose={() => { setShowImport(false); setActionTarget(null); }}
          onImported={() => { setShowImport(false); setActionTarget(null); fetchAll(); }}
        />
      )}

      {mergeSource && (
        <ExportModal
          visible={showExport}
          collectionId={mergeSource.id}
          collectionName={mergeSource.name}
          onClose={() => { setShowExport(false); setActionTarget(null); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: '800', flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  searchHeader: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, height: 40,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: fontSize.md },
  searchCancel: { color: colors.primary, fontSize: fontSize.md, fontWeight: '600', marginLeft: spacing.sm },
  padH: { paddingHorizontal: spacing.lg },
  padL: { paddingLeft: spacing.lg },
  segmentedWrapper: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  segmentedContainer: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: borderRadius.md, padding: 3 },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm + 2, borderRadius: borderRadius.sm + 2 },
  segmentButtonActive: { backgroundColor: colors.surface, ...shadows.sm },
  segmentText: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: {
    color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  ownedRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md, ...shadows.sm,
  },
  ownedIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6B8AFF18', alignItems: 'center', justifyContent: 'center' },
  ownedInfo: { flex: 1 },
  ownedTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  ownedSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  ownedValue: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700', marginRight: spacing.xs },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700' },
  emptySubtitle: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.sm, marginHorizontal: spacing.xl },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, marginTop: spacing.lg },
  emptyButtonText: { color: '#FFFFFF', fontSize: fontSize.lg, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
