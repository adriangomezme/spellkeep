import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { getAllMeta } from '../../src/lib/catalog/catalogMeta';
import {
  ensureCatalogFresh,
  getCatalogSyncState,
  subscribeCatalogSync,
} from '../../src/lib/catalog/catalogSync';
import { clearPendingUploads, getPendingUploadCount } from '../../src/lib/powersync';
import type { CatalogSyncState } from '../../src/lib/catalog/types';
import {
  getLatestOverrideAt,
  subscribePriceOverrides,
} from '../../src/lib/pricing/priceOverrides';
import { refreshCollectionPrices, type RefreshProgress } from '../../src/lib/pricing/refresh';
import {
  getImportHistory,
  subscribeImportHistory,
  type ImportHistoryEntry,
} from '../../src/lib/importHistory';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';
import { useAuthContext } from '../../src/components/AuthProvider';
import { AuthSheet } from '../../src/components/AuthSheet';

type StorageSnapshot = {
  catalogVersion?: string;
  catalogLastSyncAt?: string;
  imageCacheBytes?: number;
  pendingUploads?: number;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAnonymous, signOut } = useAuthContext();
  const [showAuth, setShowAuth] = useState(false);
  const [storage, setStorage] = useState<StorageSnapshot>({});
  const [catalogState, setCatalogState] = useState<CatalogSyncState>(() => getCatalogSyncState());
  const [refreshing, setRefreshing] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [priceRefreshedAt, setPriceRefreshedAt] = useState<string | null>(() => getLatestOverrideAt());
  const [priceProgress, setPriceProgress] = useState<RefreshProgress | null>(null);

  const loadStorage = useCallback(async () => {
    const [meta, imageCacheBytes, history, pendingUploads] = await Promise.all([
      getAllMeta(),
      measureImageCacheBytes(),
      getImportHistory(),
      getPendingUploadCount(),
    ]);
    setStorage({
      catalogVersion: meta.snapshot_version,
      catalogLastSyncAt: meta.last_sync_at,
      imageCacheBytes,
      pendingUploads,
    });
    setImportHistory(history);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStorage();
    }, [loadStorage])
  );

  useEffect(() => subscribeCatalogSync(setCatalogState), []);
  useEffect(() => subscribeImportHistory(setImportHistory), []);
  useEffect(
    () => subscribePriceOverrides(() => setPriceRefreshedAt(getLatestOverrideAt())),
    []
  );

  async function onPullRefresh() {
    setRefreshing(true);
    await loadStorage();
    setRefreshing(false);
  }

  async function handleClearImages() {
    Alert.alert(
      'Clear cached images?',
      'Images will re-download as you view them again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await Image.clearDiskCache();
              await Image.clearMemoryCache();
            } catch {}
            await loadStorage();
          },
        },
      ]
    );
  }

  async function handleRefreshCatalog() {
    try {
      await ensureCatalogFresh();
    } catch {}
    await loadStorage();
  }

  async function handleClearPending() {
    const count = storage.pendingUploads ?? 0;
    if (count === 0) {
      Alert.alert('Nothing to clear', 'There are no pending uploads.');
      return;
    }
    Alert.alert(
      'Cancel pending uploads?',
      `Drops ${count.toLocaleString()} queued mutations without sending them. The server is the source of truth — local data will reconcile from sync. Use only if you know a queued bulk delete/import is stuck.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear queue',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearPendingUploads();
            } catch (err: any) {
              Alert.alert('Clear failed', err?.message ?? 'Please try again.');
            }
            await loadStorage();
          },
        },
      ]
    );
  }

  async function handleRefreshPrices() {
    if (priceProgress) return;
    setPriceProgress({ total: 0, completed: 0 });
    try {
      const result = await refreshCollectionPrices((p) => setPriceProgress(p));
      if (result.scanned === 0) {
        Alert.alert(
          'Nothing to update',
          'No cards in your collection were found locally. Wait for sync to finish and try again.'
        );
      }
    } catch (err: any) {
      console.error('[handleRefreshPrices]', err);
      Alert.alert('Could not update prices', err?.message ?? 'Please try again later.');
    } finally {
      setPriceProgress(null);
    }
  }

  const catalogBusy =
    catalogState.status === 'checking' ||
    catalogState.status === 'downloading' ||
    catalogState.status === 'applying';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.sectionLabel}>Account</Text>

        {isAnonymous || !user?.email ? (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => setShowAuth(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>Log in / Sign up</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                Save your collection to the cloud
              </Text>
            </View>
            <View style={styles.rowTrailing}>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => {
              Alert.alert('Sign out?', 'You can log back in any time.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: () => {
                    signOut();
                  },
                },
              ]);
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="person-circle" size={22} color={colors.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {user.email}
              </Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                Tap to sign out
              </Text>
            </View>
            <View style={styles.rowTrailing}>
              <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>Storage</Text>

        {/* Card Database */}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={handleRefreshCatalog}
          disabled={catalogBusy}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="library" size={20} color={colors.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Card Database</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {describeCatalog(storage, catalogState)}
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            {catalogBusy ? (
              <Text style={styles.rowValue}>{formatProgress(catalogState)}</Text>
            ) : (
              <Ionicons name="refresh" size={18} color={colors.textMuted} />
            )}
          </View>
        </TouchableOpacity>

        {/* Prices */}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={handleRefreshPrices}
          disabled={!!priceProgress}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#22C55E1A' }]}>
            <Ionicons name="cash" size={20} color="#22C55E" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Prices</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {describePrices(priceRefreshedAt, storage.catalogLastSyncAt, priceProgress)}
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            {priceProgress ? (
              <Text style={styles.rowValue}>{formatPriceProgress(priceProgress)}</Text>
            ) : (
              <Ionicons name="refresh" size={18} color={colors.textMuted} />
            )}
          </View>
        </TouchableOpacity>

        {/* Pending Sync Queue — always visible for debug visibility. */}
        {(() => {
          const count = storage.pendingUploads ?? 0;
          const hasQueue = count > 0;
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={handleClearPending}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: hasQueue ? '#EF44441A' : colors.surfaceSecondary },
                ]}
              >
                <Ionicons
                  name={hasQueue ? 'alert-circle' : 'checkmark-circle'}
                  size={20}
                  color={hasQueue ? '#EF4444' : colors.textMuted}
                />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Pending Uploads</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {hasQueue
                    ? `${count.toLocaleString()} queued · tap to cancel`
                    : 'Queue empty'}
                </Text>
              </View>
              {hasQueue && (
                <View style={styles.rowTrailing}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </View>
              )}
            </TouchableOpacity>
          );
        })()}

        {/* Cached Images */}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={handleClearImages}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#F4A8431A' }]}>
            <Ionicons name="images" size={20} color="#F4A843" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Cached Images</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              Tap to clear
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            <Text style={styles.rowValue}>
              {formatBytes(storage.imageCacheBytes)}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Settings</Text>

        {/* Sorting */}

        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={() => router.push('/profile/sort-preferences')}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="swap-vertical" size={20} color={colors.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Sorting</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              Folders, binders, lists — order preference
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Activity</Text>

        {/* Import History */}

        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={() => router.push('/profile/import-history')}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="time" size={20} color={colors.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Import History</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {describeHistory(importHistory)}
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <AuthSheet visible={showAuth} onClose={() => setShowAuth(false)} />
    </View>
  );
}

function describeHistory(entries: ImportHistoryEntry[]): string {
  if (entries.length === 0) return 'No imports yet';
  const last = entries[0];
  const when = formatRelativeTime(new Date(last.finishedAt).toISOString());
  const count = entries.length === 1 ? '1 import' : `${entries.length} imports`;
  return `${count} · last ${when}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Recursively measure a directory. expo-image stores its disk cache inside
 * FileSystem.cacheDirectory — using that as the root is a close-enough
 * proxy that also captures any miscellaneous Expo image processing.
 */
async function measureImageCacheBytes(): Promise<number> {
  const root = FileSystem.cacheDirectory;
  if (!root) return 0;
  try {
    return await dirSize(root);
  } catch {
    return 0;
  }
}

async function dirSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  if (!info.isDirectory) return (info as any).size ?? 0;
  const entries = await FileSystem.readDirectoryAsync(uri);
  let total = 0;
  for (const entry of entries) {
    const child = uri.endsWith('/') ? uri + entry : `${uri}/${entry}`;
    total += await dirSize(child).catch(() => 0);
  }
  return total;
}

function describeCatalog(storage: StorageSnapshot, state: CatalogSyncState): string {
  if (state.status === 'error') return 'Sync error — tap to retry';
  if (state.status === 'checking') return 'Checking for updates…';
  if (state.status === 'downloading') return 'Downloading new version…';
  if (state.status === 'applying') return 'Applying update…';

  if (!storage.catalogVersion) return 'Not yet installed';

  const last = storage.catalogLastSyncAt ? formatRelativeTime(storage.catalogLastSyncAt) : 'never';
  return `v${storage.catalogVersion} · updated ${last}`;
}

function formatProgress(state: CatalogSyncState): string {
  if (state.progress == null) return '…';
  return `${Math.round(state.progress * 100)}%`;
}

function describePrices(
  overrideAt: string | null,
  snapshotAt: string | undefined,
  progress: RefreshProgress | null
): string {
  if (progress) {
    if (progress.total === 0) return 'Preparing…';
    return `Updating ${progress.completed} / ${progress.total}`;
  }
  const best = latestTimestamp(overrideAt, snapshotAt);
  if (!best) return 'Never updated · tap to update';
  return `Updated ${formatRelativeTime(best)}`;
}

function formatPriceProgress(progress: RefreshProgress): string {
  if (progress.total === 0) return '…';
  return `${Math.round((progress.completed / progress.total) * 100)}%`;
}

function latestTimestamp(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  rowSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  rowTrailing: { alignItems: 'flex-end' },
  rowValue: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
