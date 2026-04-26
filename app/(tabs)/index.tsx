import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  duplicateCollection,
  type CollectionSummary,
  type FolderSummary,
} from '../../src/lib/collections';
import {
  deleteCollectionLocal,
  deleteFolderWithContentsLocal,
  emptyCollectionLocal,
  moveToFolderLocal,
  reorderCollectionFoldersLocal,
  reorderCollectionsLocal,
  updateSortPreferenceLocal,
} from '../../src/lib/collections.local';
import { useCollectionsHub } from '../../src/lib/hooks/useCollectionsHub';
import { useSortPreference } from '../../src/lib/hooks/useSortPreference';
import { ReorderableListView } from '../../src/components/collection/ReorderableList';
import { CatalogBadge } from '../../src/components/CatalogBadge';
import { CollectionListItem } from '../../src/components/collection/CollectionListItem';
import { FolderListItem } from '../../src/components/collection/FolderListItem';
import { CreateCollectionModal } from '../../src/components/collection/CreateCollectionModal';
import { MarketHeaderCompact } from '../../src/components/collection/MarketHeaderCompact';
import { InsightTabs } from '../../src/components/collection/InsightTabs';
import { useImportJob } from '../../src/components/collection/ImportJobProvider';
import { CollectionActionSheet } from '../../src/components/collection/CollectionActionSheet';
import { setQuickAddTargetId, useQuickAddTargetId } from '../../src/lib/quickAdd';
import { showToast } from '../../src/components/Toast';
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

// Reorder mode is a per-section toggle: 'folders' rearranges the folder
// list for the active tab; 'items' rearranges the root binders/lists for
// the active tab. Inside a folder the folder screen owns its own mode.
type ReorderSection = 'folders' | 'items' | null;

export default function CollectionHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('binder');
  const {
    binders,
    lists,
    binderFolders,
    listFolders,
    ownedStats,
    revalidate,
  } = useCollectionsHub();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const quickAddTargetId = useQuickAddTargetId();
  const sortPref = useSortPreference();
  const [reorderSection, setReorderSection] = useState<ReorderSection>(null);

  // Action sheet / modals state
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchAll = useCallback(async () => {
    revalidate();
  }, [revalidate]);

  // Pull-to-search: drive a tiny hint banner from the same shared
  // value that watches scrollY, so the user gets discoverable copy
  // ("Pull to search" → "Release to search") as they overshoot the
  // top. Crossing the 60 px threshold opens the search bar.
  const PULL_THRESHOLD = 60;
  const pullY = useSharedValue(0);

  const openSearch = useCallback(() => {
    setShowSearch(true);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      pullY.value = e.contentOffset.y;
      if (!showSearch && e.contentOffset.y <= -PULL_THRESHOLD) {
        runOnJS(openSearch)();
      }
    },
  });

  const hintStyle = useAnimatedStyle(() => {
    const overscroll = Math.max(0, -pullY.value);
    const progress = Math.min(1, overscroll / PULL_THRESHOLD);
    return {
      opacity: progress,
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [-8, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const hintTextStyle = useAnimatedStyle(() => {
    const overscroll = Math.max(0, -pullY.value);
    return {
      opacity: overscroll >= PULL_THRESHOLD ? 0 : 1,
    };
  });
  const hintActiveStyle = useAnimatedStyle(() => {
    const overscroll = Math.max(0, -pullY.value);
    return {
      opacity: overscroll >= PULL_THRESHOLD ? 1 : 0,
    };
  });

  useFocusEffect(
    useCallback(() => { revalidate(); }, [revalidate])
  );

  // The hub's useQuery hooks are reactive to local mutations, so an
  // import firing local writes already triggers a re-render. We keep a
  // revalidate() call to force the cache-backed pipeline (prices, etc.)
  // to re-derive once the job lands.
  const { job } = useImportJob();
  useEffect(() => {
    if (job?.status !== 'completed') return;
    revalidate();
  }, [job?.status, job?.id, job?.collectionId, revalidate]);

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

    if (key === 'reorder') {
      const wantFolder = actionTarget.kind === 'folder';
      setActionTarget(null);
      setReorderSection(wantFolder ? 'folders' : 'items');
      return;
    }

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
      moveToFolderLocal(actionTarget.item.id, null).catch(() => {});
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
              emptyCollectionLocal(target.id)
                .catch((err) => Alert.alert('Error', err?.message ?? 'Failed to empty'));
            },
          },
        ]
      );
    } else if (key === 'set-quick-add' && actionTarget.kind === 'collection') {
      setActionTarget(null);
      setQuickAddTargetId(actionTarget.item.id).then(() => {
        showToast(`Quick Add → ${actionTarget.item.name}`);
      });
    } else if (key === 'clear-quick-add' && actionTarget.kind === 'collection') {
      setActionTarget(null);
      setQuickAddTargetId(null).then(() => {
        showToast('Quick Add target cleared');
      });
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
    } catch (err: any) {
      Alert.alert('Duplicate failed', err?.message ?? 'Unknown error');
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
                await deleteFolderWithContentsLocal(target.item.id);
              } else {
                await deleteCollectionLocal(target.item.id);
              }
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
  const allItemsForTab = activeTab === 'binder' ? binders : lists;
  const allFolders = activeTab === 'binder' ? binderFolders : listFolders;
  // Default view = root only (folders own their nested items). Search
  // mode flattens the tree: every binder/list whose name matches,
  // regardless of folder, plus folders that match by name. The user
  // can find a binder buried two folders deep with a single typed
  // term.
  const items = query
    ? allItemsForTab.filter((i) => i.name.toLowerCase().includes(query))
    : allItemsForTab.filter((c) => !c.folder_id);
  const folders = query
    ? allFolders.filter((f) => f.name.toLowerCase().includes(query))
    : allFolders;

  // Wait for PowerSync's `useQuery` to re-emit after a write.
  // Without this pause the reorder screen unmounts before the Hub's
  // sorted view updates, producing a visible flicker from old to new
  // order on Done. Two animation frames has been enough empirically.
  async function waitForReactiveTick() {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  }

  async function commitFolderReorder(orderedIds: string[]) {
    await reorderCollectionFoldersLocal(orderedIds);
    const needFlip = sortPref.folder !== 'custom';
    if (needFlip) {
      await updateSortPreferenceLocal('folder_sort_mode', 'custom');
    }
    await waitForReactiveTick();
    setReorderSection(null);
    if (needFlip) showToast('Folders now ordered by custom');
  }

  async function commitItemReorder(orderedIds: string[]) {
    await reorderCollectionsLocal(null, orderedIds);
    const prefKey = activeTab === 'binder' ? 'binder_sort_mode' : 'list_sort_mode';
    const current = activeTab === 'binder' ? sortPref.binder : sortPref.list;
    const needFlip = current !== 'custom';
    if (needFlip) {
      await updateSortPreferenceLocal(prefKey, 'custom');
    }
    await waitForReactiveTick();
    setReorderSection(null);
    if (needFlip) {
      showToast(`${activeTab === 'binder' ? 'Binders' : 'Lists'} now ordered by custom`);
    }
  }
  const emptyMessage = activeTab === 'binder'
    ? 'Create a binder to organize your cards'
    : 'Create a list for wishlists or trades';

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
        <InsightTabs
          onTabPress={(key) => {
            if (key === 'price-alerts') {
              router.push('/alerts');
              return;
            }
            console.log('Insight:', key);
          }}
        />
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

      {reorderSection === 'folders' ? (
        <ReorderableListView
          title="Reorder Folders"
          items={allFolders}
          onCommit={commitFolderReorder}
          onCancel={() => setReorderSection(null)}
          renderRow={(folder) => (
            <FolderListItem
              name={folder.name}
              itemCount={folder.item_count}
              color={folder.color}
              onPress={() => {}}
            />
          )}
        />
      ) : reorderSection === 'items' ? (
        <ReorderableListView
          title={`Reorder ${activeTab === 'binder' ? 'Binders' : 'Lists'}`}
          items={allItemsForTab.filter((c) => !c.folder_id)}
          onCommit={commitItemReorder}
          onCancel={() => setReorderSection(null)}
          renderRow={(item) => (
            <CollectionListItem
              name={item.name}
              type={item.type}
              color={item.color}
              subtitle={item.statsReady
                ? `${item.card_count} Cards · ${item.unique_cards} unique`
                : '\u00A0'}
              onPress={() => {}}
            />
          )}
        />
      ) : (
      <View style={styles.scrollWrap}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {activeTab === 'binder' && (
          <TouchableOpacity
            style={styles.ownedRow}
            onPress={() => router.push('/collection/owned')}
            activeOpacity={0.6}
          >
            <View style={styles.ownedIconCircle}>
              <Ionicons name="library" size={20} color={colors.primary} />
            </View>
            <View style={styles.ownedInfo}>
              <Text style={styles.ownedTitle}>Owned Cards</Text>
              <Text style={[styles.ownedSubtitle, ownedStats.total_cards === 0 && { opacity: 0 }]}>
                {ownedStats.total_cards > 0
                  ? `${ownedStats.total_cards} Cards · ${ownedStats.unique_cards} unique`
                  : '\u00A0'}
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
                subtitle={item.statsReady
                  ? `${item.card_count} Cards · ${item.unique_cards} unique`
                  : '\u00A0'}
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
      </Animated.ScrollView>
      {!showSearch && (
        <Animated.View style={[styles.pullHint, hintStyle]} pointerEvents="none">
          <Animated.Text style={[styles.pullHintText, hintTextStyle]}>
            ↓ Pull to search
          </Animated.Text>
          <Animated.Text
            style={[styles.pullHintText, styles.pullHintTextActive, hintActiveStyle]}
          >
            Release to search
          </Animated.Text>
        </Animated.View>
      )}
      </View>
      )}

      {/* Modals */}
      <CreateCollectionModal
        visible={showCreate}
        defaultType={activeTab}
        defaultFolderFor={activeTab}
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
        isQuickAddTarget={
          actionTarget?.kind === 'collection' &&
          actionTarget.item.id === quickAddTargetId
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
  scrollWrap: { flex: 1 },
  pullHint: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
    elevation: 5,
  },
  pullHintText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pullHintTextActive: {
    position: 'absolute',
    top: 0,
    color: colors.primary,
  },
  sectionLabel: {
    color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  ownedRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: 15,
    marginBottom: spacing.sm, gap: spacing.md, ...shadows.sm,
  },
  ownedIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  ownedInfo: { flex: 1 },
  ownedTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  ownedSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  ownedValue: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700', marginRight: spacing.xs },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700' },
  emptySubtitle: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.sm, marginHorizontal: spacing.xl },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, marginTop: spacing.lg },
  emptyButtonText: { color: '#FFFFFF', fontSize: fontSize.lg, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
